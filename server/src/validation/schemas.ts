import { z } from 'zod';

const optionalTrimmed = (max: number) => z.string().trim().max(max).optional().default('');

export const passwordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(128)
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[0-9]/, 'Password must contain a digit');

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: passwordSchema,
  firstName: z.string().trim().min(1, 'First name is required').max(100),
  lastName: z.string().trim().min(1, 'Last name is required').max(100),
  title: optionalTrimmed(150),
  company: optionalTrimmed(150),
  industry: optionalTrimmed(100),
  companySize: optionalTrimmed(50),
  country: optionalTrimmed(100),
  phone: optionalTrimmed(30),
  linkedinUrl: z
    .string()
    .trim()
    .max(300)
    .refine((v) => v === '' || /^https:\/\/(www\.)?linkedin\.com\//.test(v), {
      message: 'Must be a linkedin.com URL',
    })
    .optional()
    .default(''),
  website: z
    .string()
    .trim()
    .max(300)
    .refine((v) => v === '' || /^https?:\/\//.test(v), { message: 'Must be an http(s) URL' })
    .optional()
    .default(''),
  bio: optionalTrimmed(5000),
  coachingGoals: optionalTrimmed(5000),
  referralSource: optionalTrimmed(200),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export const profileUpdateSchema = registerSchema.omit({ email: true, password: true }).partial();

export const paymentIntentSchema = z.object({
  plan: z.enum(['one_time', 'subscription']),
});

export const adminUserUpdateSchema = z.object({
  role: z.enum(['ceo', 'support', 'admin', 'client']).optional(),
  status: z.enum(['pending_payment', 'active', 'suspended']).optional(),
  clientCompanyId: z.string().uuid().nullable().optional(),
});

export const companySchema = z.object({
  name: z.string().trim().min(1).max(200),
  contactEmail: z.string().trim().email().max(254).or(z.literal('')).optional().default(''),
});

export const positionSchema = z.object({
  clientCompanyId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional().default(''),
});

export const DISCLOSURE_LEVELS = ['anonymous', 'identified', 'full'] as const;
export const CANDIDATE_STAGES = ['sourced', 'screening', 'interviewing', 'finalist', 'placed'] as const;

export const candidateAssignSchema = z.object({
  candidateUserId: z.string().uuid(),
  disclosureLevel: z.enum(DISCLOSURE_LEVELS).optional().default('anonymous'),
  stage: z.enum(CANDIDATE_STAGES).optional().default('sourced'),
  summary: z.string().trim().max(2000).optional().default(''),
});

export const candidateUpdateSchema = z.object({
  disclosureLevel: z.enum(DISCLOSURE_LEVELS).optional(),
  stage: z.enum(CANDIDATE_STAGES).optional(),
  summary: z.string().trim().max(2000).optional(),
});

export const supportNoteSchema = z.object({
  note: z.string().trim().min(1).max(5000),
});

export const CV_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

export const PHOTO_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
