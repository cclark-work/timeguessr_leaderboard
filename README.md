# timeguessr_leaderboard

Web app for uploading Timeguessr result screenshots and tracking daily leaders.

## Features

- Upload a screenshot with a player name.
- Analyze and extract:
  - overall score
  - each of 5 stage scores
  - each stage distance (km)
  - each stage year error
- Name lookup/autocomplete based on previously uploaded names.
- Daily leaderboard showing:
  - top overall score
  - highest score for each stage
  - closest distance for each stage
  - closest year for each stage

## Azure AI integration

If these environment variables are set, uploaded screenshots are sent to Azure OpenAI for extraction:

- `AZURE_OPENAI_ENDPOINT`
- `AZURE_OPENAI_DEPLOYMENT`
- `AZURE_OPENAI_KEY`
- `AZURE_OPENAI_API_VERSION` (optional, defaults to `2024-02-15-preview`)

When Azure settings are not present, the app uses a local fallback parser that expects the uploaded file content to be JSON in this shape:

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
