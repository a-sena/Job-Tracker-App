using JobTracker.Application.Membership;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace JobTracker.Api.Controllers;

[ApiController]
[Route("api/billing")]
[Produces("application/json")]
public sealed class BillingController(IBillingService billingService) : ControllerBase
{
    [Authorize]
    [HttpPost("checkout")]
    [ProducesResponseType<BillingRedirectDto>(StatusCodes.Status200OK)]
    public Task<ActionResult<BillingRedirectDto>> CreateCheckout(
        CreateCheckoutRequest request,
        CancellationToken cancellationToken) =>
        ExecuteAsync(() => billingService.CreateCheckoutSessionAsync(
            request.BillingCycle,
            request.RequestId,
            cancellationToken));

    [Authorize]
    [HttpPost("portal")]
    [ProducesResponseType<BillingRedirectDto>(StatusCodes.Status200OK)]
    public Task<ActionResult<BillingRedirectDto>> CreatePortal(
        CancellationToken cancellationToken) =>
        ExecuteAsync(() => billingService.CreateCustomerPortalSessionAsync(
            cancellationToken));

    [Authorize]
    [HttpPost("cancel")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> CancelSubscription(
        CancellationToken cancellationToken)
    {
        try
        {
            await billingService.CancelSubscriptionAtPeriodEndAsync(cancellationToken);
            return NoContent();
        }
        catch (BillingException exception)
        {
            return Problem(
                statusCode: exception.StatusCode,
                title: "Membership cancellation failed",
                detail: exception.Message);
        }
    }

    [AllowAnonymous]
    [IgnoreAntiforgeryToken]
    [HttpPost("webhook")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Webhook(CancellationToken cancellationToken)
    {
        using var reader = new StreamReader(Request.Body);
        var payload = await reader.ReadToEndAsync(cancellationToken);
        var signature = Request.Headers["Stripe-Signature"].ToString();
        try
        {
            await billingService.ProcessWebhookAsync(
                payload,
                signature,
                cancellationToken);
            return Ok();
        }
        catch (BillingException exception)
        {
            return Problem(
                statusCode: exception.StatusCode,
                title: "Stripe webhook rejected",
                detail: exception.Message);
        }
    }

    private async Task<ActionResult<BillingRedirectDto>> ExecuteAsync(
        Func<Task<BillingRedirectDto>> operation)
    {
        try
        {
            return Ok(await operation());
        }
        catch (BillingException exception)
        {
            return Problem(
                statusCode: exception.StatusCode,
                title: "Billing request failed",
                detail: exception.Message);
        }
    }
}

public sealed record CreateCheckoutRequest(
    BillingCycle BillingCycle,
    Guid RequestId);
