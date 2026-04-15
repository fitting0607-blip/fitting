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
  profile_image_url: string | null;
  age: number | null;
};

