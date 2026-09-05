import { CountryCode, type PlaidApi } from "plaid";
import type { createClient } from "@/lib/supabase/server";

// Accounts linked before institution_name started being captured from
// Plaid Link's onSuccess metadata (client-side, free) have it null, so they
// fall into the settings page's "Other" bucket instead of grouping under
// their real bank. Looks it up via the Item → institution_id → institution
// name chain, which does cost two Plaid API calls — callers should only
// invoke this for accounts actually missing the name, not on every sync.
export async function backfillInstitutionName(
  supabase: ReturnType<typeof createClient>,
  plaid: PlaidApi,
  accessToken: string,
  householdId: string
): Promise<void> {
  const { data: itemData } = await plaid.itemGet({ access_token: accessToken });
  const institutionId = itemData.item.institution_id;
  if (!institutionId) return;

  const { data: instData } = await plaid.institutionsGetById({
    institution_id: institutionId,
    country_codes: [CountryCode.Ca, CountryCode.Us],
  });

  await supabase
    .from("accounts")
    .update({ institution_name: instData.institution.name })
    .eq("household_id", householdId)
    .eq("provider_access_token", accessToken)
    .is("institution_name", null);
}

// Keyed on Plaid's `personal_finance_category.detailed` value (their finest-
// grained taxonomy — see https://plaid.com/documents/transactions-personal-finance-category-taxonomy.csv)
// mapped onto this app's own category set (lib/utils.ts CATEGORY_CONFIG).
// `primary` alone (e.g. "FOOD_AND_DRINK") can't tell fast food from
// groceries from a sit-down restaurant — they all share the same primary —
// which was the previous version's actual bug, not just the substring
// check order.
const DETAILED_CATEGORY_MAP: Record<string, string> = {
  FOOD_AND_DRINK_GROCERIES: "groceries",
  FOOD_AND_DRINK_FAST_FOOD: "dining",
  FOOD_AND_DRINK_RESTAURANT: "dining",
  FOOD_AND_DRINK_COFFEE: "dining",
  FOOD_AND_DRINK_VENDING_MACHINES: "dining",
  FOOD_AND_DRINK_OTHER_FOOD_AND_DRINK: "dining",

  TRANSPORTATION_GAS: "transportation",
  TRANSPORTATION_PARKING: "transportation",
  TRANSPORTATION_PUBLIC_TRANSIT: "transportation",
  TRANSPORTATION_TAXIS_AND_RIDE_SHARES: "transportation",
  TRANSPORTATION_TOLLS: "transportation",
  TRANSPORTATION_BIKES_AND_SCOOTERS: "transportation",
  TRANSPORTATION_OTHER_TRANSPORTATION: "transportation",

  TRAVEL_FLIGHTS: "travel",
  TRAVEL_LODGING: "travel",
  TRAVEL_RENTAL_CARS: "travel",
  TRAVEL_PARKING: "travel",
  TRAVEL_OTHER_TRAVEL: "travel",

  RENT_AND_UTILITIES_RENT: "housing",
  RENT_AND_UTILITIES_GAS_AND_ELECTRICITY: "utilities",
  RENT_AND_UTILITIES_INTERNET_AND_CABLE: "utilities",
  RENT_AND_UTILITIES_TELEPHONE: "utilities",
  RENT_AND_UTILITIES_WATER: "utilities",
  RENT_AND_UTILITIES_SEWAGE_AND_WASTE_MANAGEMENT: "utilities",
  RENT_AND_UTILITIES_OTHER_UTILITIES: "utilities",

  LOAN_PAYMENTS_MORTGAGE_PAYMENT: "housing",
  LOAN_PAYMENTS_CREDIT_CARD_PAYMENT: "debt_payment",
  LOAN_PAYMENTS_STUDENT_LOAN_PAYMENT: "debt_payment",
  LOAN_PAYMENTS_CAR_PAYMENT: "debt_payment",
  LOAN_PAYMENTS_PERSONAL_LOAN_PAYMENT: "debt_payment",
  LOAN_PAYMENTS_OTHER_PAYMENT: "debt_payment",

  TRANSFER_OUT_SAVINGS: "savings",
  TRANSFER_IN_SAVINGS: "savings",
  TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS: "investing",
  TRANSFER_IN_INVESTMENT_AND_RETIREMENT_FUNDS: "investing",
  TRANSFER_IN_DEPOSIT: "income",
  TRANSFER_OUT_ACCOUNT_TRANSFER: "transfer",
  TRANSFER_IN_ACCOUNT_TRANSFER: "transfer",
  TRANSFER_OUT_WITHDRAWAL: "transfer",
  TRANSFER_IN_CASH_ADVANCES_AND_LOANS: "transfer",
  TRANSFER_OUT_OTHER_TRANSFER_OUT: "transfer",
  TRANSFER_IN_OTHER_TRANSFER_IN: "transfer",

  INCOME_WAGES: "income",
  INCOME_DIVIDENDS: "income",
  INCOME_INTEREST_EARNED: "income",
  INCOME_RETIREMENT_PENSION: "income",
  INCOME_TAX_REFUND: "income",
  INCOME_UNEMPLOYMENT: "income",
  INCOME_OTHER_INCOME: "income",

  MEDICAL_PRIMARY_CARE: "health",
  MEDICAL_DENTAL_CARE: "health",
  MEDICAL_EYE_CARE: "health",
  MEDICAL_NURSING_CARE: "health",
  MEDICAL_PHARMACIES_AND_SUPPLEMENTS: "health",
  MEDICAL_VETERINARY_SERVICES: "health",
  MEDICAL_OTHER_MEDICAL: "health",

  GENERAL_SERVICES_INSURANCE: "insurance",
  GENERAL_SERVICES_EDUCATION: "education",
  GENERAL_SERVICES_AUTOMOTIVE: "transportation",
  GENERAL_SERVICES_CHILDCARE: "miscellaneous",
  GENERAL_SERVICES_CONSULTING_AND_LEGAL: "miscellaneous",
  GENERAL_SERVICES_STORAGE: "miscellaneous",
  GENERAL_SERVICES_OTHER_GENERAL_SERVICES: "miscellaneous",

  ENTERTAINMENT_MUSIC_AND_AUDIO: "subscription",
  ENTERTAINMENT_TV_AND_MOVIES: "subscription",
  ENTERTAINMENT_MOVIES_AND_DVDS: "entertainment",
  ENTERTAINMENT_SPORTING_EVENTS_AMUSEMENT_PARKS_AND_MUSEUMS: "entertainment",
  ENTERTAINMENT_VIDEO_GAMES: "entertainment",
  ENTERTAINMENT_OTHER_ENTERTAINMENT: "entertainment",

  GENERAL_MERCHANDISE_GIFTS_AND_NOVELTIES: "gifts",
  GENERAL_MERCHANDISE_CLOTHING_AND_ACCESSORIES: "shopping",
  GENERAL_MERCHANDISE_ELECTRONICS: "shopping",
  GENERAL_MERCHANDISE_SUPERSTORES: "shopping",
  GENERAL_MERCHANDISE_DEPARTMENT_STORES: "shopping",
  GENERAL_MERCHANDISE_ONLINE_MARKETPLACES: "shopping",
  GENERAL_MERCHANDISE_DISCOUNT_STORES: "shopping",
  GENERAL_MERCHANDISE_PET_SUPPLIES: "shopping",
  GENERAL_MERCHANDISE_SPORTING_GOODS: "shopping",
  GENERAL_MERCHANDISE_OFFICE_SUPPLIES: "shopping",
  GENERAL_MERCHANDISE_CONVENIENCE_STORES: "shopping",
  GENERAL_MERCHANDISE_BOOKSTORES_AND_NEWSSTANDS: "shopping",
  GENERAL_MERCHANDISE_TOBACCO_AND_VAPE: "shopping",
  GENERAL_MERCHANDISE_GENERAL_MERCHANDISE: "shopping",
  GENERAL_MERCHANDISE_OTHER_GENERAL_MERCHANDISE: "shopping",

  HOME_IMPROVEMENT_FURNITURE: "housing",
  HOME_IMPROVEMENT_HARDWARE: "housing",
  HOME_IMPROVEMENT_REPAIR_AND_MAINTENANCE: "housing",
  HOME_IMPROVEMENT_SECURITY: "housing",
  HOME_IMPROVEMENT_OTHER_HOME_IMPROVEMENT: "housing",

  PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS: "health",
  PERSONAL_CARE_HAIR_AND_BEAUTY: "personal_care",
  PERSONAL_CARE_LAUNDRY_AND_DRY_CLEANING: "personal_care",
  PERSONAL_CARE_OTHER_PERSONAL_CARE: "personal_care",

  BANK_FEES_INTEREST_CHARGE: "debt_payment",
  BANK_FEES_ATM_FEES: "miscellaneous",
  BANK_FEES_FOREIGN_TRANSACTION_FEES: "miscellaneous",
  BANK_FEES_INSUFFICIENT_FUNDS: "miscellaneous",
  BANK_FEES_OVERDRAFT_FEES: "miscellaneous",
  BANK_FEES_OTHER_BANK_FEES: "miscellaneous",

  GOVERNMENT_AND_NON_PROFIT_DONATIONS: "gifts",
  GOVERNMENT_AND_NON_PROFIT_GOVERNMENT_DEPARTMENTS_AND_AGENCIES: "miscellaneous",
  GOVERNMENT_AND_NON_PROFIT_TAX_PAYMENT: "miscellaneous",
  GOVERNMENT_AND_NON_PROFIT_OTHER_GOVERNMENT_AND_NON_PROFIT: "miscellaneous",

  OTHER_OTHER: "miscellaneous",
};

// `detailed` is Plaid's precise category (e.g. FOOD_AND_DRINK_FAST_FOOD vs
// FOOD_AND_DRINK_GROCERIES) and should always be present when Plaid
// returns a personal_finance_category at all. `legacyCategory` (the old
// `category` array's first entry, a human-readable string like "Fast
// Food") is only a fallback for the rare transaction with no PFC data —
// checked most-specific-first so a broad substring like "payment" can't
// swallow a more specific match the way the previous version did.
export function mapCategory(detailed?: string | null, legacyCategory?: string | null): string {
  if (detailed && DETAILED_CATEGORY_MAP[detailed]) return DETAILED_CATEGORY_MAP[detailed];

  const c = (legacyCategory ?? "").toLowerCase();
  if (!c) return "miscellaneous";
  if (c.includes("fast food") || c.includes("restaurant") || c.includes("coffee") || c.includes("dining")) return "dining";
  if (c.includes("grocer") || c.includes("supermarket")) return "groceries";
  if (c.includes("airline") || c.includes("hotel") || c.includes("lodging") || c.includes("travel")) return "travel";
  if (c.includes("transport") || c.includes("gas station") || c.includes("taxi") || c.includes("ride share") || c.includes("parking")) return "transportation";
  if (c.includes("mortgage")) return "housing";
  if (c.includes("rent")) return "housing";
  if (c.includes("utilities") || c.includes("electric") || c.includes("water") || c.includes("internet") || c.includes("telephone")) return "utilities";
  if (c.includes("loan") || c.includes("credit card payment")) return "debt_payment";
  if (c.includes("payroll") || c.includes("deposit") || c.includes("interest earned")) return "income";
  if (c.includes("transfer") || c.includes("withdrawal")) return "transfer";
  if (c.includes("subscription") || c.includes("streaming")) return "subscription";
  if (c.includes("pharmacy") || c.includes("medical") || c.includes("health") || c.includes("dental")) return "health";
  if (c.includes("education") || c.includes("school") || c.includes("tuition")) return "education";
  if (c.includes("entertainment") || c.includes("recreation") || c.includes("movie")) return "entertainment";
  if (c.includes("clothing") || c.includes("merchandise") || c.includes("shopping")) return "shopping";
  if (c.includes("insurance")) return "insurance";
  return "miscellaneous";
}

// Shared by /api/plaid/exchange-token (initial sync) and /api/plaid/sync
// (manual re-sync) — kept in one place after exchange-token's own copy of
// this loop drifted from sync's and never handled `removed`. Plaid reports
// a pending transaction's id there when it replaces it with a posted one
// under a NEW id, so skipping `removed` leaves both the pending and posted
// copies of the same real transaction sitting in the table as apparent
// duplicates. `modified` covers updates (e.g. amount corrections) to a
// transaction that keeps its existing id.
export async function syncPlaidTransactions(
  supabase: ReturnType<typeof createClient>,
  plaid: PlaidApi,
  accessToken: string,
  householdId: string,
  plaidToUuid: Record<string, string>,
  startCursor?: string
): Promise<{ added: number }> {
  let cursor = startCursor;
  let hasMore = true;
  let added = 0;

  while (hasMore) {
    const { data } = await plaid.transactionsSync({
      access_token: accessToken,
      cursor,
      options: { include_personal_finance_category: true },
    });

    const toUpsert = [...data.added, ...data.modified]
      .filter((t) => plaidToUuid[t.account_id])
      .map((t) => ({
        account_id: plaidToUuid[t.account_id],
        household_id: householdId,
        provider_transaction_id: t.transaction_id,
        amount: Math.abs(t.amount),
        currency: t.iso_currency_code ?? "USD",
        date: t.date,
        merchant_name: t.merchant_name ?? t.name,
        description: t.name,
        category: mapCategory(t.personal_finance_category?.detailed, t.category?.[0]),
        is_income: t.amount < 0,
        is_pending: t.pending,
        tags: [],
      }));

    if (toUpsert.length > 0) {
      const { data: upserted, error } = await supabase
        .from("transactions")
        .upsert(toUpsert, { onConflict: "provider_transaction_id" })
        .select("id");
      if (error) throw error;
      added += upserted?.length ?? 0;
    }

    for (const t of data.removed) {
      if (!t.transaction_id) continue;
      await supabase.from("transactions").delete().eq("provider_transaction_id", t.transaction_id);
    }

    cursor = data.next_cursor;
    hasMore = data.has_more;

    // Persist progress after every page, not just at the end — if this
    // function gets cut off by the serverless timeout partway through a
    // long history, the next sync resumes from here instead of restarting
    // the whole history from scratch.
    await supabase
      .from("accounts")
      .update({ plaid_cursor: cursor })
      .in("id", Object.values(plaidToUuid));
  }

  return { added };
}
