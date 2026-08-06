import { useState, type FormEvent } from "react";
import { apiFetch, clearCsrfToken } from "../../lib/apiClient";

interface ChangePasswordDialogProps {
  apiBaseUrl: string;
  onClose: () => void;
}

async function readError(response: Response): Promise<string> {
  try {
    const problem = (await response.json()) as {
      detail?: string;
      title?: string;
      errors?: Record<string, string[]>;
    };
    return (
      Object.values(problem.errors ?? {}).flat().join(" ") ||
      problem.detail ||
      problem.title ||
      "The password could not be changed."
    );
  } catch {
    return "The password could not be changed.";
  }
}

export default function ChangePasswordDialog({
  apiBaseUrl,
  onClose,
}: ChangePasswordDialogProps): JSX.Element {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    if (newPassword !== confirmNewPassword) {
      setError("The new passwords do not match.");
      return;
    }

    setIsSaving(true);
    try {
      const response = await apiFetch(apiBaseUrl, "/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ currentPassword, newPassword, confirmNewPassword }),
      });
      if (!response.ok) throw new Error(await readError(response));

      clearCsrfToken(apiBaseUrl);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      setSuccess(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "The password could not be changed.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#172033]/60 px-4" role="dialog" aria-modal="true" aria-labelledby="change-password-title" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="w-full max-w-md rounded-xl border-2 border-[#172033] bg-[#f8f7f2] p-6 shadow-[7px_7px_0_#172033] sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#3157d5]">Account security</p>
            <h2 id="change-password-title" className="mt-1 text-2xl font-black">Change password</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-lg border-2 border-[#172033] bg-white text-lg font-black">×</button>
        </div>

        {success ? (
          <div className="mt-6">
            <div className="rounded-lg border-2 border-[#32704a] bg-[#e7f5e9] px-4 py-4 text-sm font-bold text-[#245637]">Your password has been changed. Your current session remains active.</div>
            <button type="button" onClick={onClose} className="mt-5 w-full rounded-lg border-2 border-[#172033] bg-[#ffcc4d] px-4 py-3 text-sm font-black shadow-[3px_3px_0_#172033]">Done</button>
          </div>
        ) : (
          <form onSubmit={(event) => void submit(event)} className="mt-6 space-y-4">
            {[
              ["Current password", currentPassword, setCurrentPassword, "current-password"],
              ["New password", newPassword, setNewPassword, "new-password"],
              ["Confirm new password", confirmNewPassword, setConfirmNewPassword, "new-password"],
            ].map(([label, value, setter, autocomplete]) => (
              <label key={label as string} className="block text-sm font-black">
                {label as string}
                <input type="password" required minLength={label === "Current password" ? undefined : 10} maxLength={128} autoComplete={autocomplete as string} value={value as string} onChange={(event) => (setter as (value: string) => void)(event.target.value)} className="mt-2 w-full rounded-lg border-2 border-[#a9abb2] bg-white px-4 py-3 font-medium outline-none focus:border-[#3157d5] focus:ring-4 focus:ring-[#3157d5]/15" />
              </label>
            ))}
            <p className="text-xs font-medium leading-5 text-[#697080]">Use at least 10 characters, including an uppercase letter, lowercase letter, and number.</p>
            {error ? <div role="alert" className="rounded-lg border-2 border-[#b84a3b] bg-[#ffe1dc] px-4 py-3 text-sm font-bold text-[#7f3026]">{error}</div> : null}
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={onClose} className="flex-1 rounded-lg border-2 border-[#172033] bg-white px-4 py-3 text-sm font-black">Cancel</button>
              <button disabled={isSaving} className="flex-1 rounded-lg border-2 border-[#172033] bg-[#ffcc4d] px-4 py-3 text-sm font-black shadow-[3px_3px_0_#172033] disabled:opacity-60">{isSaving ? "Saving…" : "Save password"}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
