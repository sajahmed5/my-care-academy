import Stripe from "stripe";
import { getStripe } from "@/lib/stripe";

export interface BillingSummary {
  /** The recurring price on the subscription (monthly breakdown). */
  price: { amount: number; currency: string; interval: string } | null;
  /** What the next payment will be and when it's taken. */
  nextPayment: { amount: number; currency: string; date: string | null } | null;
  /** Masked payment details — never anything identifying beyond last digits. */
  paymentMethod:
    | { kind: "card"; brand: string; last4: string }
    | { kind: "bacs_debit"; last4: string; sortCode: string }
    | { kind: "other"; label: string }
    | null;
}

function maskSortCode(sortCode: string | null | undefined): string {
  if (!sortCode || sortCode.length < 2) return "••-••-••";
  const tail = sortCode.slice(-2);
  return `••-••-${tail}`;
}

function describePaymentMethod(
  pm: Stripe.PaymentMethod | null,
): BillingSummary["paymentMethod"] {
  if (!pm) return null;
  if (pm.card) {
    return { kind: "card", brand: pm.card.brand, last4: pm.card.last4 };
  }
  if (pm.bacs_debit) {
    return {
      kind: "bacs_debit",
      last4: pm.bacs_debit.last4 ?? "••••",
      sortCode: maskSortCode(pm.bacs_debit.sort_code),
    };
  }
  return { kind: "other", label: pm.type.replace(/_/g, " ") };
}

/**
 * Read-only billing summary for the org Account page. Best-effort: any Stripe
 * hiccup (no key locally, deleted customer, cancelled sub) degrades to nulls
 * rather than breaking the page.
 */
export async function getBillingSummary(org: {
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
}): Promise<BillingSummary> {
  const summary: BillingSummary = {
    price: null,
    nextPayment: null,
    paymentMethod: null,
  };
  if (!org.stripe_customer_id) return summary;

  try {
    const stripe = getStripe();

    if (org.stripe_subscription_id) {
      // The upcoming-invoice preview doesn't depend on the subscription read,
      // so the two Stripe calls go out together rather than one after the
      // other. A failed preview (e.g. cancelled) settles to null on its own.
      const previewRead = stripe.invoices
        .createPreview({
          customer: org.stripe_customer_id,
          subscription: org.stripe_subscription_id,
        })
        .catch(() => null);
      const sub = await stripe.subscriptions.retrieve(
        org.stripe_subscription_id,
        { expand: ["default_payment_method"] },
      );

      const price = sub.items.data[0]?.price;
      if (price?.unit_amount != null) {
        summary.price = {
          amount: price.unit_amount,
          currency: price.currency,
          interval: price.recurring?.interval ?? "month",
        };
      }

      summary.paymentMethod = describePaymentMethod(
        (sub.default_payment_method as Stripe.PaymentMethod | null) ?? null,
      );

      // No preview (e.g. cancelled) — leave nextPayment null.
      const preview = await previewRead;
      if (preview) {
        const ts = preview.next_payment_attempt ?? preview.period_end;
        summary.nextPayment = {
          amount: preview.amount_due,
          currency: preview.currency,
          date: ts ? new Date(ts * 1000).toISOString() : null,
        };
      }
    }

    if (!summary.paymentMethod) {
      const customer = await stripe.customers.retrieve(org.stripe_customer_id, {
        expand: ["invoice_settings.default_payment_method"],
      });
      if (!("deleted" in customer)) {
        summary.paymentMethod = describePaymentMethod(
          (customer.invoice_settings
            ?.default_payment_method as Stripe.PaymentMethod | null) ?? null,
        );
      }
    }
  } catch {
    // Stripe unavailable — the page renders what the database knows.
  }
  return summary;
}

export function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount / 100);
}
