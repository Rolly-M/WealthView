import { NextResponse } from "next/server";
import { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } from "plaid";
import { createClient } from "@/lib/supabase/server";

const plaid = new PlaidApi(
  new Configuration({
    basePath: PlaidEnvironments[process.env.PLAID_ENV ?? "sandbox"],
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID,
        "PLAID-SECRET": process.env.PLAID_SECRET,
      },
    },
  })
);

export async function POST() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const response = await plaid.linkTokenCreate({
    user: { client_user_id: user.id },
    client_name: "WealthView Duo",
    products: [Products.Transactions],
    country_codes: [CountryCode.Us, CountryCode.Ca, CountryCode.Gb],
    language: "en",
  });

  return NextResponse.json({ link_token: response.data.link_token });
}
