/**
 * Convert a stage's raw distance value + unit to kilometres.
 *
 * Accepts the new AI shape { distance, distanceUnit } where distanceUnit is
 * "mi" (miles), "km", "m" (metres), or "ft" (feet) (case-insensitive).
 * Everything is normalized to kilometres so the leaderboard stays comparable
 * across days. For backwards-compatibility with the text fallback (which may
 * still upload the legacy { distanceKm: number } shape), a bare finite number
 * in distanceKm is treated as already in km.
 *
 * When distances are displayed in miles, values less than 1 mile are shown
 * with 3 decimal places of precision; to preserve that behaviour when the
 * AI returns other units we round the computed miles to 3 decimal places and
 * convert back to kilometres before returning.
 *
 * Throws a descriptive error (naming the 1-based stage index) for any
 * missing or unrecognized value so validation failures are easy to diagnose.
 */
function resolveDistanceKm(stage, index) {
  // New shape: { distance: number, distanceUnit: "m"|"km"|"ft"|"mi" }
  if (stage.distance !== undefined || stage.distanceUnit !== undefined) {
    if (!Number.isFinite(stage.distance)) {
      throw new Error(`Stage ${index + 1} is missing a valid distance.`);
    }
    const unit = typeof stage.distanceUnit === 'string' ? stage.distanceUnit.trim().toLowerCase() : '';
    if (unit === 'km') return stage.distance;
    if (unit === 'm') return stage.distance / 1000;
    if (unit === 'ft' || unit === 'foot' || unit === 'feet') return stage.distance * 0.0003048;
    if (unit === 'mi' || unit === 'mile' || unit === 'miles') return stage.distance * 1.609344;
    throw new Error(
      `Stage ${index + 1} has an unrecognized distanceUnit "${stage.distanceUnit}". Expected "mi", "km", "m", or "ft".`,
    );
  }

  // Legacy shape: { distanceKm: number } — treat bare number as already-km.
  if (Number.isFinite(stage.distanceKm)) {
    return stage.distanceKm;
  }

  throw new Error(`Stage ${index + 1} is missing a valid distance.`);
}

function validateAnalysis(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('AI analysis did not return an object.');
  }

  if (!Number.isFinite(data.overallScore)) {
    throw new Error('AI analysis is missing a valid overallScore.');
  }

  if (!Array.isArray(data.stages) || data.stages.length !== 5) {
    throw new Error('AI analysis must include exactly 5 stages.');
  }

  return {
    overallScore: data.overallScore,
    stages: data.stages.map((stage, index) => {
      if (!Number.isFinite(stage.score)) {
        throw new Error(`Stage ${index + 1} is missing a valid score.`);
      }
      let distanceKm = resolveDistanceKm(stage, index);

      // When distances are shown in miles, values under 1 mile should be
      // displayed with 3 decimal places. To preserve that display precision
      // while keeping internal data in kilometres, round the computed miles to
      // 3 decimal places and convert back to kilometres.
      const miles = distanceKm / 1.609344;
      if (miles < 1) {
        const roundedMiles = Number(miles.toFixed(3));
        distanceKm = roundedMiles * 1.609344;
      }

      if (!Number.isFinite(stage.yearsOff)) {
        throw new Error(`Stage ${index + 1} is missing a valid yearsOff.`);
      }
      return { score: stage.score, distanceKm, yearsOff: stage.yearsOff };
    }),
  };
}

async function extractWithAzureOpenAI(imageBuffer) {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;
  const apiKey = process.env.AZURE_OPENAI_KEY;
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-10-21';

  if (!endpoint || !deployment || !apiKey) {
    return null;
  }

  const imageBase64 = imageBuffer.toString('base64');
  const url = `${endpoint.replace(/\/$/, '')}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': apiKey,
    },
    body: JSON.stringify({
      messages: [
        {
          role: 'system',
          content:
            'Extract Timeguessr results and respond with strict JSON only. ' +
            'Transcribe the distance value and unit exactly as shown on screen — do not convert or do any arithmetic.',
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text:
                'Return JSON: {"overallScore":number,"stages":[{"score":number,"distance":number,"distanceUnit":"mi"|"km"|"m"|"ft","yearsOff":number} x5]}. ' +
                'For each stage, read the distance number and its unit as separate fields. ' +
                'Use "mi" for miles, "km" for kilometres, "m" for metres, and "ft" for feet.',
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/png;base64,${imageBase64}`,
              },
            },
          ],
        },
      ],
      temperature: 0,
      max_tokens: 500,
    }),
  });

  if (!response.ok) {
    throw new Error(`Azure OpenAI request failed (${response.status}).`);
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('Azure OpenAI response was empty.');
  }

  const parsed = JSON.parse(content);
  return validateAnalysis(parsed);
}

function extractFromTextFallback(imageBuffer) {
  const text = imageBuffer.toString('utf8').trim();
  if (!text) {
    throw new Error('No text found in uploaded file and Azure AI is not configured.');
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Fallback parser expects uploaded content as JSON when Azure AI is not configured.');
  }

  return validateAnalysis(parsed);
}

async function extractTimeguessrScores(imageBuffer) {
  const azureResult = await extractWithAzureOpenAI(imageBuffer);
  if (azureResult) {
    return azureResult;
  }

  return extractFromTextFallback(imageBuffer);
}

module.exports = {
  extractTimeguessrScores,
  validateAnalysis,
};
