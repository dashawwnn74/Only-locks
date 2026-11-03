
const ALLOWED_SPORTS = {
  basketball_nba: {
    label: "NBA",
    markets: [
      "player_points",
      "player_rebounds",
      "player_assists",
      "player_threes",
      "player_blocks",
      "player_steals",
      "player_points_rebounds_assists"
    ]
  },
  americanfootball_nfl: {
    label: "NFL",
    markets: [
      "player_pass_yds",
      "player_pass_tds",
      "player_pass_completions",
      "player_rush_yds",
      "player_rush_attempts",
      "player_receptions",
      "player_reception_yds",
      "player_anytime_td"
    ]
  }
};

const BASE_URL = "https://api.the-odds-api.com/v4";

function response(statusCode, data, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...extraHeaders
    },
    body: JSON.stringify(data)
  };
}

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") {
    return response(405, { error: "Use GET requests." });
  }

  const apiKey = process.env.ODDS_API_KEY;

  if (!apiKey) {
    return response(500, {
      error: "The API key is not configured in Netlify."
    });
  }

  const params = event.queryStringParameters || {};
  const sport = params.sport || "basketball_nba";
  const action = params.action || "events";

  const sportConfig = ALLOWED_SPORTS[sport];

  if (!sportConfig) {
    return response(400, {
      error: "Only NBA and NFL are enabled right now."
    });
  }

  let url;

  if (action === "events") {
    // This endpoint does not consume Odds API credits.
    url = new URL(`${BASE_URL}/sports/${sport}/events`);
  } else if (action === "props") {
    const eventId = params.eventId;

    if (
      !eventId ||
      !/^[a-zA-Z0-9_-]+$/.test(eventId)
    ) {
      return response(400, {
        error: "A valid eventId is required."
      });
    }

    const requestedMarkets = (params.markets || "")
      .split(",")
      .map(value => value.trim())
      .filter(Boolean);

    if (
      requestedMarkets.length === 0 ||
      requestedMarkets.length > 3 ||
      requestedMarkets.some(
        market => !sportConfig.markets.includes(market)
      )
    ) {
      return response(400, {
        error: "Choose 1 to 3 supported markets for this sport.",
        availableMarkets: sportConfig.markets
      });
    }

    url = new URL(
      `${BASE_URL}/sports/${sport}/events/${eventId}/odds`
    );

    url.searchParams.set("regions", "us");
    url.searchParams.set("markets", requestedMarkets.join(","));
    url.searchParams.set("oddsFormat", "american");
  } else {
    return response(400, {
      error: "Action must be events or props."
    });
  }

  url.searchParams.set("apiKey", apiKey);

  try {
    const apiResponse = await fetch(url.toString());

    const remaining = apiResponse.headers.get(
      "x-requests-remaining"
    );
    const used = apiResponse.headers.get(
      "x-requests-used"
    );
    const lastCost = apiResponse.headers.get(
      "x-requests-last"
    );

    const quotaHeaders = {
      "X-API-Credits-Remaining": remaining || "unknown",
      "X-API-Credits-Used": used || "unknown",
      "X-API-Last-Cost": lastCost || "unknown"
    };

    const data = await apiResponse.json();

    if (!apiResponse.ok) {
      return response(apiResponse.status, {
        error: "The Odds API returned an error.",
        details: data
      }, quotaHeaders);
    }

    return response(200, {
      success: true,
      sport,
      sportName: sportConfig.label,
      action,
      creditsRemaining: remaining,
      creditsUsed: used,
      lastRequestCost: lastCost,
      data
    }, quotaHeaders);

  } catch (error) {
    return response(502, {
      error: "Could not reach The Odds API.",
      details: error.message
    });
  }
};
