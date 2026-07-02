function validateBooking(body) {
  const errors = [];

  if (!body.name?.trim()) errors.push("Name is required.");
  if (!body.email?.trim()) errors.push("Email is required.");
  if (!body.phone?.trim()) errors.push("Phone is required.");
  if (!body.message?.trim()) errors.push("Message is required.");
  if (!body.consent) errors.push("Contact consent is required.");

  return errors;
}

function normalizeBooking(body) {
  return {
    name: String(body.name || "").trim(),
    email: String(body.email || "").trim(),
    phone: String(body.phone || "").trim(),
    package: String(body.package || "").trim(),
    departure_city: String(body["departure-city"] || body.departure_city || "").trim(),
    destination: String(body.destination || "").trim(),
    travel_month: String(body["travel-month"] || body.travel_month || "").trim(),
    travelers: Number.parseInt(body.travelers, 10) || 1,
    budget: String(body.budget || "").trim(),
    passport_status: String(body["passport-status"] || body.passport_status || "").trim(),
    message: String(body.message || "").trim(),
    consent: String(body.consent || "").trim(),
  };
}

function jsonResponse(statusCode, payload) {
  return new Response(JSON.stringify(payload), {
    status: statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export { validateBooking, normalizeBooking, jsonResponse };
