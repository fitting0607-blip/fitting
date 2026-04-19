export type Agreements = {
  termsOfService: boolean;
  privacyPolicy: boolean;
  pointsPolicy: boolean;
};

export type Gender = 'male' | 'female';

export type MbtiParts = {
  EI: 'E' | 'I' | null;
  SN: 'S' | 'N' | null;
  TF: 'T' | 'F' | null;
  JP: 'J' | 'P' | null;
};

export type RegisterDraft = {
  email: string;
  password: string;
  agreements: Agreements;
  mbtiParts: MbtiParts;
  mbti: string | null;
  sports: string[];
  workout_frequency: string | null;
  workout_goals: string[];
  nickname: string;
  gender: Gender | null;
  /** Set after Storage upload in age step (logged-in session). */
  profile_image_url: string | null;
  /** Picked image (expo-image-picker base64) until 회원가입 완료 시 업로드 */
  profile_image_base64: string | null;
  age: number | null;
};

