import { supabase } from '../../supabase';

export async function isPhoneAlreadyRegistered(
  phone: string
): Promise<{ duplicate: boolean; errorMessage?: string }> {
  const normalized = phone.trim();
  if (!normalized) {
    return { duplicate: false };
  }

  const { data, error } = await supabase.rpc('check_phone_exists', {
    check_phone: normalized,
  });

  if (error) {
    return { duplicate: false, errorMessage: error.message };
  }

  return { duplicate: data === true };
}
