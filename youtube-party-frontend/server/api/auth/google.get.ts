export default defineOAuthGoogleEventHandler({
  async onSuccess(event, { user, tokens }) {
    const profile = user.profile;

    await setUserSession(event, {
      user: {
        // googleId: user.openid,
        email: user.email,
        userId: user.id,
        imageUrl: user.picture,
        name: user.name,
      },
      loggedInAt: Date.now(),
    });
    return sendRedirect(event, "/");
  },
  async onError(event, error) {
    console.error("Google OAuth error:", error);
    return sendRedirect(event, "/login-error");
  },
});
