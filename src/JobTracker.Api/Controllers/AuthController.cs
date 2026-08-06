using JobTracker.Api.Authentication;
using JobTracker.Application.Authentication;
using JobTracker.Infrastructure.Identity;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;

namespace JobTracker.Api.Controllers;

[ApiController]
[Route("api/auth")]
[Produces("application/json")]
public sealed class AuthController(
    UserManager<AppUser> userManager,
    SignInManager<AppUser> signInManager,
    IAntiforgery antiforgery,
    ILegacyWorkspaceClaimService workspaceClaimService) : ControllerBase
{
    [AllowAnonymous]
    [HttpGet("csrf")]
    public ActionResult<AntiforgeryTokenDto> GetCsrfToken()
    {
        var tokens = antiforgery.GetAndStoreTokens(HttpContext);
        return Ok(new AntiforgeryTokenDto(
            tokens.RequestToken ?? throw new InvalidOperationException("Unable to create an antiforgery token.")));
    }

    [AllowAnonymous]
    [HttpPost("register")]
    [ProducesResponseType<AuthUserDto>(StatusCodes.Status201Created)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<AuthUserDto>> Register(
        RegisterRequest request,
        CancellationToken cancellationToken)
    {
        var email = request.Email.Trim().ToLowerInvariant();
        var user = new AppUser
        {
            Id = Guid.NewGuid(),
            UserName = email,
            Email = email,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };

        var result = await userManager.CreateAsync(user, request.Password);
        if (!result.Succeeded)
        {
            foreach (var error in result.Errors)
            {
                ModelState.AddModelError(error.Code, error.Description);
            }

            return ValidationProblem(ModelState);
        }

        try
        {
            if (request.LegacyUserId is { } legacyUserId)
            {
                await workspaceClaimService.ClaimAsync(
                    legacyUserId,
                    user.Id,
                    cancellationToken);
            }

        }
        catch
        {
            await userManager.DeleteAsync(user);
            throw;
        }

        await signInManager.SignInAsync(user, isPersistent: false);

        return Created("/api/auth/me", ToDto(user));
    }

    [AllowAnonymous]
    [HttpPost("login")]
    [ProducesResponseType<AuthUserDto>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status423Locked)]
    public async Task<ActionResult<AuthUserDto>> Login(LoginRequest request)
    {
        var user = await userManager.FindByEmailAsync(request.Email.Trim());
        if (user is null)
        {
            return InvalidCredentials();
        }

        var result = await signInManager.PasswordSignInAsync(
            user,
            request.Password,
            request.RememberMe,
            lockoutOnFailure: true);
        if (result.IsLockedOut)
        {
            return Problem(
                statusCode: StatusCodes.Status423Locked,
                title: "Account temporarily locked",
                detail: "Too many unsuccessful sign-in attempts. Try again in 15 minutes.");
        }

        return result.Succeeded ? Ok(ToDto(user)) : InvalidCredentials();
    }

    [Authorize]
    [HttpGet("me")]
    [ProducesResponseType<AuthUserDto>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<ActionResult<AuthUserDto>> Me(ICurrentUser currentUser)
    {
        var user = await userManager.FindByIdAsync(currentUser.UserId.ToString());
        return user is null ? Unauthorized() : Ok(ToDto(user));
    }

    [Authorize]
    [HttpPost("change-password")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> ChangePassword(
        ChangePasswordRequest request,
        ICurrentUser currentUser)
    {
        var user = await userManager.FindByIdAsync(currentUser.UserId.ToString());
        if (user is null)
        {
            return Unauthorized();
        }

        var result = await userManager.ChangePasswordAsync(
            user,
            request.CurrentPassword,
            request.NewPassword);
        if (!result.Succeeded)
        {
            foreach (var error in result.Errors)
            {
                ModelState.AddModelError(error.Code, error.Description);
            }

            return ValidationProblem(ModelState);
        }

        user.UpdatedAt = DateTimeOffset.UtcNow;
        await userManager.UpdateAsync(user);
        await signInManager.RefreshSignInAsync(user);
        return NoContent();
    }

    [Authorize]
    [HttpPost("logout")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Logout()
    {
        await signInManager.SignOutAsync();
        return NoContent();
    }

    private ObjectResult InvalidCredentials() => Problem(
        statusCode: StatusCodes.Status401Unauthorized,
        title: "Sign-in failed",
        detail: "The email address or password is incorrect.");

    private static AuthUserDto ToDto(AppUser user) =>
        new(user.Id, user.Email ?? user.UserName ?? string.Empty);
}
