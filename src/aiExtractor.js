function parseDistanceKm(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const lower = value.trim().toLowerCase();
    if (lower.endsWith('km')) {
      const num = parseFloat(lower);
      if (Number.isFinite(num)) return num;
    } else if (lower.endsWith('m')) {
      const num = parseFloat(lower);
      if (Number.isFinite(num)) return num / 1000;
    }
  }
  return NaN;
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

  data.stages.forEach((stage, index) => {
    const distanceKm = parseDistanceKm(stage.distanceKm);
    if (!Number.isFinite(stage.score)) {
      throw new Error(`Stage ${index + 1} is missing a valid score.`);
    }
    if (!Number.isFinite(distanceKm)) {
      throw new Error(`Stage ${index + 1} is missing a valid distanceKm.`);
    }
    if (!Number.isFinite(stage.yearsOff)) {
      throw new Error(`Stage ${index + 1} is missing a valid yearsOff.`);
    }
  });

  return {
    overallScore: data.overallScore,
    stages: data.stages.map((stage) => ({
      score: stage.score,
      distanceKm: parseDistanceKm(stage.distanceKm),
      yearsOff: stage.yearsOff,
    })),
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
            'Always express distances in kilometers. ' +
            'If a distance is shown in meters (e.g. "500 m"), divide by 1000 to convert to km (e.g. 0.5).',
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text:
                'Return JSON: {"overallScore":number,"stages":[{"score":number,"distanceKm":number,"yearsOff":number} x5]}. ' +
                'For each stage, read the distance unit shown (m or km). If the unit is meters, divide by 1000 so distanceKm is always in kilometers.',
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
