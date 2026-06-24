# Finance Chat Assistant

## Architecture

The chat system has two modes, selected by environment:

### Mode 1: Rule-Based (No API key required)

Keyword detection + direct SQL queries over the user's financial data.

Supports:
- Spending by category (current month)
- Savings over any date range  
- Cash / liquid balances
- Subscription detection
- Biggest transactions
- Category trend (highest increase)

### Mode 2: Claude-Powered (requires `ANTHROPIC_API_KEY`)

`POST /api/chat` fetches live financial context and passes it to **Claude** (`claude-sonnet-4-6`) with a system prompt that includes:

- All active account balances and net worth
- Last 60 transactions with date, merchant, amount, and category
- Active budgets and their category allocations
- Active goals and current progress

```
System: You are a knowledgeable personal finance assistant for a couple...
        ACCOUNTS: Chase Checking $3,247.50 · Marcus Savings $12,500.00 ...
        RECENT TRANSACTIONS: 2026-06-20 Whole Foods $127.43 [groceries] ...
        ACTIVE BUDGETS: Groceries $800/mo ...
        ACTIVE GOALS: Emergency Fund $5,000 / $15,000 (33%) ...
User:   What did we spend the most on this month?
```

Claude answers using only the provided context, keeping responses concise and financially grounded.

## Conversation Threading

- Each `chat_thread` belongs to one user and one household
- Messages are stored in `chat_messages` with role (`user`/`assistant`), content, and suggested follow-ups
- Prior thread messages (last 20) are included in every API call for conversation continuity
- The frontend shows thread history in a sidebar

## Example Questions & Answers

**Q: What did we spend the most on this month?**
> Here's your spending breakdown for June 2026:
> - Housing: $1,850.00
> - Groceries: $416.40
> - Dining: $312.10
> - Shopping: $220.99
> - Transportation: $164.40
>
> Total: $3,824.32

**Q: How much did we save in the last 90 days?**
> Over the last 90 days:
> - Income: $24,000.00
> - Spending: $18,432.60
> - Savings: $5,567.40 (23.2% savings rate)

**Q: Which subscriptions should we cancel?**
> Active subscriptions detected this month:
> - Netflix: $15.99/mo
> - Spotify: $10.99/mo
> - Amazon Prime: $14.99/mo
> - Apple One: $28.95/mo
> Total: $70.92/month
>
> Review any you no longer use to save money.

**Q: What's our savings rate this year?**
> Over the last 180 days:
> - Income: $48,000.00
> - Spending: $36,214.80
> - Savings: $11,785.20 (24.6% savings rate)
> Great job — you're above the 20% target!

**Q: What were our biggest transactions last month?**
> Largest transactions:
> - Apple Store: $1,299.00 (Jun 8)
> - WestJet Airlines: $480.00 (Jun 2)
> - IKEA: $420.00 (Jun 10)
> - Airbnb Stay: $320.00 (May 21)
> - Scotiabank Arena Tickets: $180.00 (Jun 17)

## Safe Refusals

Claude is prompted to decline out-of-scope requests:
- "Should I buy this stock?" → "I can provide research information on ETFs but cannot give personalized investment advice."
- "How do I avoid taxes?" → "That's outside what I can help with — please consult a tax professional."
- "Is it safe to invest in crypto?" → Redirected to the investment research section with a disclaimer.

## Suggested Follow-ups

Every Claude response optionally ends with:

```
FOLLOWUPS: ["question 1?", "question 2?", "question 3?"]
```

The API strips this line and returns `suggested_followups` as a structured array. The frontend renders them as clickable chips below the response.
