/**
 * Convert a stage's raw distance value + unit to kilometres.
 *
 * Accepts the new AI shape { distance, distanceUnit } where distanceUnit is
 * "m" or "km" (case-insensitive).  For backwards-compatibility with the text
 * fallback (which may still upload the legacy { distanceKm: number } shape),
 * a bare finite number in distanceKm is treated as already in km.
 *
 * Throws a descriptive error (naming the 1-based stage index) for any
 * missing or unrecognized value so validation failures are easy to diagnose.
 */
function resolveDistanceKm(stage, index) {
  // New shape: { distance: number, distanceUnit: "m"|"km" }
  if (stage.distance !== undefined || stage.distanceUnit !== undefined) {
    if (!Number.isFinite(stage.distance)) {
      throw new Error(`Stage ${index + 1} is missing a valid distance.`);
    }
    const unit = typeof stage.distanceUnit === 'string' ? stage.distanceUnit.trim().toLowerCase() : '';
    if (unit === 'km') return stage.distance;
    if (unit === 'm') return stage.distance / 1000;
    throw new Error(
      `Stage ${index + 1} has an unrecognized distanceUnit "${stage.distanceUnit}". Expected "m" or "km".`,
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
      const distanceKm = resolveDistanceKm(stage, index);
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
                'Return JSON: {"overallScore":number,"stages":[{"score":number,"distance":number,"distanceUnit":"km"|"m","yearsOff":number} x5]}. ' +
                'For each stage, read the distance number and the unit (m or km) as separate fields.',
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
