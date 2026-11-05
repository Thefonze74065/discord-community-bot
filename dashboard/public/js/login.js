const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get("error") === "unauthorized") {
  document.getElementById("error-message").classList.remove("d-none");
}
