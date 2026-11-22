import { z } from "zod";
import { ListingSchema } from "../domain/schemas";
import { UserComparableInputSchema } from "../market/providers";

const UploadId = z.string().regex(/^up_[a-z0-9]{6,32}$/);

export const DraftRequestSchema = z.object({
  url: z.string().trim().max(2000).optional(),
  imageIds: z.array(UploadId).max(12).default([]),
  pastedText: z.string().max(12000).optional(),
});

/** Vom Client bestätigter Inseratsentwurf. Bildreferenzen müssen Upload-IDs sein. */
export const ClientListingSchema = ListingSchema.extend({
  title: z.string().max(200).optional(),
  description: z.string().max(12000).optional(),
  url: z.string().max(2000).optional(),
  images: z
    .array(z.object({ ref: UploadId, kind: z.enum(["product_photo", "listing_screenshot", "review_screenshot", "video_frame"]), label: z.string().max(80).optional() }))
    .max(12)
    .default([]),
});

export const SellerRequestSchema = z.object({
  method: z.enum(["screenshots", "screen_recording", "pasted_text"]),
  imageIds: z.array(UploadId).max(30).default([]),
  pastedText: z.string().max(50000).optional(),
  platformTotalClaimed: z.coerce.number().int().min(0).max(1_000_000).optional(),
});

export const AnalysisRequestSchema = z.object({
  requestId: z.string().uuid(),
  listing: ClientListingSchema,
  comparables: z.array(UserComparableInputSchema).max(40).default([]),
  seller: SellerRequestSchema.optional(),
});

export const QuickCheckRequestSchema = z.object({ listing: ClientListingSchema });

export const CheckoutRequestSchema = z.object({
  packageId: z.string().max(40),
  consentImmediateExecution: z.literal(true),
});
