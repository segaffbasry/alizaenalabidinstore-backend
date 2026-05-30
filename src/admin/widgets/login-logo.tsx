import { defineWidgetConfig } from "@medusajs/admin-sdk";

// Logo widget disabled — use Medusa's default logo on the login/reset screens.
const LoginLogo = () => null;

export const config = defineWidgetConfig({
  zone: "login.before",
});

export default LoginLogo;
