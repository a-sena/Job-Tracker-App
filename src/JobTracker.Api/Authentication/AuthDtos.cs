using System.ComponentModel.DataAnnotations;

namespace JobTracker.Api.Authentication;

public sealed class RegisterRequest
{
    [Required, EmailAddress, MaxLength(256)]
    public string Email { get; init; } = string.Empty;

    [Required, MinLength(10), MaxLength(128)]
    public string Password { get; init; } = string.Empty;

    [Required, Compare(nameof(Password))]
    public string ConfirmPassword { get; init; } = string.Empty;

    public Guid? LegacyUserId { get; init; }
}

public sealed class LoginRequest
{
    [Required, EmailAddress, MaxLength(256)]
    public string Email { get; init; } = string.Empty;

    [Required, MaxLength(128)]
    public string Password { get; init; } = string.Empty;

    public bool RememberMe { get; init; }
}

public sealed class ChangePasswordRequest
{
    [Required, MaxLength(128)]
    public string CurrentPassword { get; init; } = string.Empty;

    [Required, MinLength(10), MaxLength(128)]
    public string NewPassword { get; init; } = string.Empty;

    [Required, Compare(nameof(NewPassword))]
    public string ConfirmNewPassword { get; init; } = string.Empty;
}

public sealed record AuthUserDto(Guid Id, string Email);

public sealed record AntiforgeryTokenDto(string Token);
