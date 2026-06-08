const DEFAULT_BASE_URL = 'https://timeguessr-leaderboard.azurewebsites.net';

function formatScore(value) {
  return Number(value).toLocaleString('en-US');
}

// Build the payload for a Power Automate "post to a channel from a webhook"
// flow: a message envelope wrapping a single Adaptive Card.
function buildTeamsMessage(entry, baseUrl = DEFAULT_BASE_URL) {
  const score = formatScore(entry.overallScore);
  return {
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        contentUrl: null,
        content: {
          $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
          type: 'AdaptiveCard',
          version: '1.4',
          body: [
            {
              type: 'TextBlock',
              size: 'Large',
              weight: 'Bolder',
              text: '🌍 New Timeguessr score!',
            },
            {
              type: 'TextBlock',
              size: 'Medium',
              wrap: true,
              text: `**${entry.name}** just posted **${score}** / 50,000`,
            },
            {
              type: 'TextBlock',
              isSubtle: true,
              spacing: 'None',
              text: entry.date,
            },
          ],
          actions: [
            {
              type: 'Action.OpenUrl',
              title: 'View leaderboard',
              url: baseUrl,
            },
          ],
        },
      },
    ],
  };
}

// Post a notification for a new entry. No-ops when TEAMS_WEBHOOK_URL is unset,
// and never throws — a Teams outage must not fail an upload.
async function notifyTeams(entry) {
  const url = process.env.TEAMS_WEBHOOK_URL;
  if (!url) {
    return false;
  }

  const baseUrl = process.env.APP_BASE_URL || DEFAULT_BASE_URL;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildTeamsMessage(entry, baseUrl)),
    });

    if (!response.ok) {
      // eslint-disable-next-line no-console
      console.error(`Teams notification failed (${response.status}).`);
      return false;
    }
    return true;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Teams notification error:', error.message);
    return false;
  }
}

module.exports = {
  notifyTeams,
  buildTeamsMessage,
};
