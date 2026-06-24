# Finance Chat Assistant

## Architecture

The chat system has two modes, selected by environment:

### Mode 1: Rule-Based (No API key required)

`ChatService._rule_based_answer()` uses keyword detection + direct SQL queries over the user's financial data.

Supports:
- Spending by category (current month)
- Savings over any date range  
- Cash / liquid balances
- Subscription detection
- Biggest transactions
- Category trend (highest increase)

### Mode 2: OpenAI-Powered (requires `OPENAI_API_KEY`)

`ChatService._openai_answer()` builds a financial context string from live data and passes it to GPT-4o with a system prompt that:
- Restricts answers to the provided context
- Explicitly prohibits personalized investment advice
- Asks for concise, friendly responses

```
System: You are a helpful financial assistant... answer ONLY from context...
User:   Financial context: {income, spending, categories...}
        Question: What did we spend on dining?
```

## Conversation Threading

- Each `ChatThread` belongs to one user and one household
- Threads have a `scope`: `household` (shared data) or `personal` (only this user's accounts)
- Messages are stored in `ChatMessage` with role (`user`/`assistant`), content, sources, and suggested follow-ups
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

The system explicitly refuses:
- "Should I buy this stock?" → "I can provide research information on ETFs but cannot give personalized investment advice."
- "How do I avoid taxes?" → "That's outside what I can help with — please consult a tax professional."
- "Is it safe to invest in crypto?" → Redirected to the investment research section with a disclaimer.

## Sources

Each assistant response includes a `sources` array — transaction IDs or date ranges that the answer is based on. In the OpenAI mode these are populated post-answer by cross-referencing the response with the underlying data.

## Suggested Follow-ups

Every assistant message includes 2-3 suggested follow-up questions that appear as clickable chips below the response, guiding the user toward useful next questions without requiring them to know what to ask.
