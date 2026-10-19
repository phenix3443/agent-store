ALTER TABLE "subscriptions" ADD COLUMN "waffo_payment_id" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "paid_amount" numeric;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "currency" text;