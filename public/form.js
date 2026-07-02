document.addEventListener("DOMContentLoaded", () => {
  const form = document.querySelector(".contact-form");

  if (!form) {
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const submitButton = form.querySelector('button[type="submit"]');
    const originalLabel = submitButton.textContent;
    submitButton.disabled = true;
    submitButton.textContent = "Saving...";

    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());

    if (!form.querySelector("#consent").checked) {
      alert("Please agree to be contacted before submitting.");
      submitButton.disabled = false;
      submitButton.textContent = originalLabel;
      return;
    }

    try {
      const response = await fetch("/api/bookings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Could not save your booking.");
      }

      window.location.href = "/success.html";
    } catch (error) {
      alert(error.message || "Something went wrong. Please try again.");
      submitButton.disabled = false;
      submitButton.textContent = originalLabel;
    }
  });
});
