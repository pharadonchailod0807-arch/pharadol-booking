const GOOGLE_PLACES_AUTOCOMPLETE_URL =
  "https://places.googleapis.com/v1/places:autocomplete";
const GOOGLE_PLACES_TEXT_SEARCH_URL =
  "https://places.googleapis.com/v1/places:searchText";

const buildPlaceSuggestion = (suggestion) => {
  const placePrediction = suggestion?.placePrediction;
  if (!placePrediction) return null;

  const mainText =
    placePrediction.structuredFormat?.mainText?.text ||
    placePrediction.text?.text ||
    "";
  const secondaryText =
    placePrediction.structuredFormat?.secondaryText?.text || "";
  const displayText = placePrediction.text?.text || mainText;

  if (!mainText && !displayText) return null;

  return {
    id: placePrediction.placeId || displayText,
    value: mainText || displayText,
    title: mainText || displayText,
    subtitle: secondaryText,
    source: "place",
  };
};

const buildQuerySuggestion = (suggestion) => {
  const queryPrediction = suggestion?.queryPrediction;
  const text = queryPrediction?.text?.text || "";

  if (!text) return null;

  return {
    id: `query-${text}`,
    value: text,
    title: text,
    subtitle: "คำค้นแนะนำจาก Google",
    source: "query",
  };
};

const buildTextSearchSuggestion = (place) => {
  const title = place?.displayName?.text || "";
  const subtitle = place?.formattedAddress || "";

  if (!title) return null;

  return {
    id: place.id || `${title}-${subtitle}`,
    value: title,
    title,
    subtitle,
    source: "text",
  };
};

const dedupeSuggestions = (suggestions) => {
  const seenValues = new Set();

  return suggestions.filter((suggestion) => {
    const key = `${suggestion.value}|${suggestion.subtitle || ""}`.toLocaleLowerCase(
      "th"
    );
    if (seenValues.has(key)) return false;
    seenValues.add(key);
    return true;
  });
};

export async function GET(request) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  const { searchParams } = new URL(request.url);
  const input = String(searchParams.get("input") || "").trim();

  if (!apiKey || input.length < 2) {
    return Response.json({ suggestions: [], configured: Boolean(apiKey) });
  }

  try {
    const sharedHeaders = {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
    };
    const [autocompleteResult, textSearchResult] = await Promise.allSettled([
      fetch(GOOGLE_PLACES_AUTOCOMPLETE_URL, {
        method: "POST",
        headers: {
          ...sharedHeaders,
          "X-Goog-FieldMask":
            "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text,suggestions.placePrediction.structuredFormat.mainText.text,suggestions.placePrediction.structuredFormat.secondaryText.text,suggestions.queryPrediction.text.text",
        },
        body: JSON.stringify({
          input,
          includePureServiceAreaBusinesses: true,
          includeQueryPredictions: true,
          languageCode: "th",
          regionCode: "TH",
        }),
      }),
      fetch(GOOGLE_PLACES_TEXT_SEARCH_URL, {
        method: "POST",
        headers: {
          ...sharedHeaders,
          "X-Goog-FieldMask":
            "places.id,places.displayName.text,places.formattedAddress",
        },
        body: JSON.stringify({
          textQuery: `${input} ประเทศไทย`,
          includePureServiceAreaBusinesses: true,
          languageCode: "th",
          maxResultCount: 10,
          regionCode: "TH",
        }),
      }),
    ]);

    const autocompleteResponse =
      autocompleteResult.status === "fulfilled" ? autocompleteResult.value : null;
    const textSearchResponse =
      textSearchResult.status === "fulfilled" ? textSearchResult.value : null;

    const autocompletePayload = autocompleteResponse
      ? await autocompleteResponse.json()
      : {};
    const textSearchPayload = textSearchResponse
      ? await textSearchResponse.json()
      : {};

    if (!autocompleteResponse?.ok && !textSearchResponse?.ok) {
      return Response.json(
        {
          suggestions: [],
          error:
            autocompletePayload?.error?.message ||
            textSearchPayload?.error?.message ||
            "Cannot load Google Places",
        },
        { status: autocompleteResponse?.status || textSearchResponse?.status || 500 }
      );
    }

    const autocompleteSuggestions = autocompleteResponse?.ok
      ? (autocompletePayload.suggestions || [])
          .map((suggestion) =>
            suggestion.placePrediction
              ? buildPlaceSuggestion(suggestion)
              : buildQuerySuggestion(suggestion)
          )
          .filter(Boolean)
      : [];
    const textSearchSuggestions = textSearchResponse?.ok
      ? (textSearchPayload.places || [])
          .map(buildTextSearchSuggestion)
          .filter(Boolean)
      : [];
    const suggestions = dedupeSuggestions([
      ...autocompleteSuggestions,
      ...textSearchSuggestions,
    ]).slice(0, 12);

    return Response.json({ suggestions, configured: true });
  } catch (error) {
    return Response.json(
      { suggestions: [], error: error.message || "Cannot load Google Places" },
      { status: 500 }
    );
  }
}
