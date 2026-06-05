const REQUIRED_STAGE_FIELDS = ['score', 'distanceKm', 'yearsOff'];

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

  data.stages.forEach((stage, index) => {
    for (const field of REQUIRED_STAGE_FIELDS) {
      if (!Number.isFinite(stage[field])) {
        throw new Error(`Stage ${index + 1} is missing a valid ${field}.`);
      }
    }
  });

  return {
    overallScore: data.overallScore,
    stages: data.stages.map((stage) => ({
      score: stage.score,
      distanceKm: stage.distanceKm,
      yearsOff: stage.yearsOff,
    })),
  };
}

async function extractWithAzureOpenAI(imageBuffer) {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;
  const apiKey = process.env.AZURE_OPENAI_KEY;
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-02-15-preview';

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
          content: 'Extract Timeguessr results and respond with strict JSON only.',
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Return JSON: {"overallScore":number,"stages":[{"score":number,"distanceKm":number,"yearsOff":number} x5]}.',
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
