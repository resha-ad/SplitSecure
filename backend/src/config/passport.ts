import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { env } from "./env";
import { findOrCreateGoogleUser } from "../modules/auth/auth.service";

// OAuth is wired up as an *additional* login method alongside the custom
// credential/TOTP flow above - not a replacement, and not a third-party
// "auth as a service" product (Firebase/Auth0/Supabase Auth are explicitly
// disallowed by the brief). Passport here only performs the OAuth handshake
// with Google; session issuance still goes through our own issueSession().
if (env.googleClientId && env.googleClientSecret) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: env.googleClientId,
        clientSecret: env.googleClientSecret,
        callbackURL: env.googleCallbackUrl,
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value;
          if (!email) {
            return done(new Error("google_profile_missing_email"));
          }
          const user = await findOrCreateGoogleUser(profile.id, email, profile.displayName ?? email);
          done(null, user);
        } catch (err) {
          done(err as Error);
        }
      }
    )
  );
}

export { passport };
