import { supabase } from '../../supabase';

export async function isEmailAlreadyRegistered(
  email: string
): Promise<{ duplicate: boolean; errorMessage?: string }> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) {
    return { duplicate: false };
  }

  const { data, error } = await supabase.rpc('check_email_exists', {
    check_email: normalized,
  });

  if (error) {
    return { duplicate: false, errorMessage: error.message };
  }

  return { duplicate: data === true };
}
