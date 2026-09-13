const json = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify(body),
});

exports.handler = async (event) => {
  const address = event.queryStringParameters?.address?.trim();

  if (!address || address.length > 100) {
    return json(400, { error: "Enter a complete U.S. street address (up to 100 characters)." });
  }

  try {
    const geocoderQuery = new URLSearchParams({
      address,
      benchmark: "4",
      vintage: "4",
      layers: "10",
      format: "json",
    });
    const geocoderResponse = await fetch(
      `https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress?${geocoderQuery}`,
      {
        headers: {
          Accept: "application/json",
          "User-Agent": "Mozilla/5.0 (compatible; LocationLens/1.0)",
        },
      },
    );
    if (!geocoderResponse.ok) throw new Error("The Census geocoder is temporarily unavailable.");

    const geocoder = await geocoderResponse.json();
    const match = geocoder.result?.addressMatches?.[0];
    const tract = match?.geographies?.["Census Tracts"]?.[0];
    if (!tract) {
      return json(422, { error: "Address was not matched to a Census tract. Try a complete U.S. street address." });
    }

    const acsQuery = new URLSearchParams({
      get: "NAME,B01003_001E,B19013_001E,B01002_001E",
      for: `tract:${tract.TRACT}`,
      in: `state:${tract.STATE} county:${tract.COUNTY}`,
    });
    const acsResponse = await fetch(`https://api.census.gov/data/2024/acs/acs5?${acsQuery}`);
    if (!acsResponse.ok) throw new Error("The Census survey service is temporarily unavailable.");

    const rows = await acsResponse.json();
    if (!rows?.[1]) throw new Error("Census survey data was unavailable for this location.");
    const [name, population, income, age] = rows[1];

    return json(200, {
      matchedAddress: match.matchedAddress,
      name,
      population: Number(population),
      income: Number(income),
      age: Number(age),
    });
  } catch (error) {
    return json(502, { error: error.message || "Unable to retrieve Census data. Please try again." });
  }
};
