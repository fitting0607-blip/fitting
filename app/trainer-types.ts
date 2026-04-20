export type TrainerProfileRow = {
  id: string;
  user_id: string;
  facility_name: string | null;
  facility_addr: string | null;
  facility_addr_detail: string | null;
  intro: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  status?: 'pending' | 'approved' | 'paid' | string | null;
  is_approved: boolean | null;
  facility_images: string[] | null;
  cert_images: string[] | null;
  profile_images: string[] | null;
};
