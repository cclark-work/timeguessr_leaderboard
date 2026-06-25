# timeguessr_leaderboard

Web app for uploading Timeguessr result screenshots and tracking daily leaders.

## Features

- Upload a screenshot with a player name.
- Analyze and extract:
  - overall score
  - each of 5 stage scores
  - each stage distance (read in the unit shown on screen — miles, km, m, or ft — and normalized to km internally; shown in miles)
  - each stage year error
- Name lookup/autocomplete based on previously uploaded names.
- Daily leaderboard (with a date picker to view past days) showing:
  - top 5 overall scores
  - highest score for each stage
  - closest distance for each stage
  - closest year for each stage

## Azure AI integration

If these environment variables are set, uploaded screenshots are sent to Azure OpenAI for extraction:

- `AZURE_OPENAI_ENDPOINT`
- `AZURE_OPENAI_DEPLOYMENT`
- `AZURE_OPENAI_KEY`
- `AZURE_OPENAI_API_VERSION` (optional, defaults to `2024-10-21`)

The AI reads each stage's distance as a number plus its unit (for example: `{ "distance": 568.0, "distanceUnit": "mi" }`, where `distanceUnit` is `mi`, `km`, `m`, or `ft`) and the app converts the value to kilometres internally for comparison.

When Azure settings are not present you can upload a JSON fallback instead. The app accepts either the legacy `distanceKm` shape or the newer `{ distance, distanceUnit }` shape. Example new AI output:

```json
{
  "overallScore": 12345,
  "stages": [
    { "score": 3000, "distance": 568.0, "distanceUnit": "mi", "yearsOff": 2 },
    { "score": 2500, "distance": 400.2, "distanceUnit": "mi", "yearsOff": 1 },
    { "score": 2400, "distance": 200.5, "distanceUnit": "ft", "yearsOff": 8 },
    { "score": 2200, "distance": 110.2, "distanceUnit": "mi", "yearsOff": 4 },
    { "score": 2245, "distance": 922.9, "distanceUnit": "mi", "yearsOff": 6 }
  ]
}
```

Display precision and rounding

- When distances are displayed in miles, values under 1 mile are shown with 3 decimal places of precision (for example: `0.038 miles`).
- To keep leaderboard comparisons stable regardless of the unit returned by the AI, the extractor rounds the computed miles to 3 decimal places and converts that rounded miles value back to kilometres for internal storage. This preserves the displayed precision while keeping all internal comparisons in kilometres.
- Conversion reference: 1 ft = 0.3048 m → 0.0003048 km; 1 mi = 1.609344 km.

Legacy JSON (text fallback) example using distanceKm:

```json
{
  "overallScore": 12345,
  "stages": [
    { "score": 3000, "distanceKm": 12, "yearsOff": 1 },
    { "score": 2500, "distanceKm": 45, "yearsOff": 2 },
    { "score": 2400, "distanceKm": 17, "yearsOff": 4 },
    { "score": 2200, "distanceKm": 85, "yearsOff": 3 },
    { "score": 2245, "distanceKm": 9, "yearsOff": 0 }
  ]
}
```

## Persistence

If `AZURE_STORAGE_CONNECTION_STRING` is set, entries and names are stored
durably in Azure Table Storage (tables `entries`, partitioned by day, and
`names`). When it is not set, an in-memory store is used (data is lost on
restart) — convenient for local development and tests.

## Deployment

Pushes to `main` are built, tested, and deployed to Azure App Service
(`timeguessr-leaderboard`) by [.github/workflows/deploy.yml](.github/workflows/deploy.yml)
using OIDC federated credentials (no stored secrets).

## Run

```bash
npm install
npm start
```

Open `http://localhost:3000`.

## Test

```bash
npm test
```
