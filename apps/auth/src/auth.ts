import { betterAuth } from 'better-auth';
import { prismaAdapter } from '@better-auth/prisma-adapter';
import { organization } from 'better-auth/plugins';
import { Resend } from 'resend';
import { Database } from '@kloudi/infrastructure/database';

const resend = new Resend(process.env['RESEND_API_KEY']);

export async function createAuth() {
  const db = await Database.getInstance().getClient();

  return betterAuth({
    database: prismaAdapter(db as Parameters<typeof prismaAdapter>[0], {
      provider: 'postgresql',
    }),

    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      sendResetPassword: async ({
        user,
        url,
      }: {
        user: { email: string };
        url: string;
      }) => {
        await resend.emails.send({
          from: 'kloudi <auth@kloudi.ai>',
          to: user.email,
          subject: 'Reset your password',
          html: `<p>Reset your password: <a href="${url}">${url}</a></p>`,
        });
      },
    },

    emailVerification: {
      sendVerificationEmail: async ({
        user,
        url,
      }: {
        user: { email: string };
        url: string;
      }) => {
        await resend.emails.send({
          from: 'kloudi <auth@kloudi.ai>',
          to: user.email,
          subject: 'Verify your email',
          html: `<p>Verify your email: <a href="${url}">${url}</a></p>`,
        });
      },
    },

    // Only register OAuth providers when credentials are present — Better Auth
    // silently accepts empty strings and produces confusing errors on sign-in.
    // Better Auth links by email: GitHub sign-in with a matching email merges
    // into the existing email/password account.
    socialProviders: {
      ...(process.env['GITHUB_CLIENT_ID']
        ? {
            github: {
              clientId: process.env['GITHUB_CLIENT_ID'],
              clientSecret: process.env['GITHUB_CLIENT_SECRET'] ?? '',
            },
          }
        : {}),
      ...(process.env['GOOGLE_CLIENT_ID']
        ? {
            google: {
              clientId: process.env['GOOGLE_CLIENT_ID'],
              clientSecret: process.env['GOOGLE_CLIENT_SECRET'] ?? '',
            },
          }
        : {}),
    },

    plugins: [
      organization({
        sendInvitationEmail: async (data) => {
          const inviterName =
            (data.inviter as { user?: { name?: string } }).user?.name ??
            'Someone';
          const orgName = data.organization.name;
          const invitationId = data.invitation.id;
          const invitationEmail = data.invitation.email;
          await resend.emails.send({
            from: 'kloudi <auth@kloudi.ai>',
            to: invitationEmail,
            subject: `${inviterName} invited you to ${orgName} on kloudi`,
            html: `
              <p>${inviterName} invited you to join <b>${orgName}</b> on kloudi.</p>
              <p><a href="${process.env['APP_URL']}/accept-invite?token=${invitationId}">Accept invitation</a></p>
            `,
          });
        },
      }),
    ],

    trustedOrigins: [
      process.env['APP_URL'] ?? 'http://localhost:3000',
      process.env['API_URL'] ?? 'http://localhost:3001',
    ],
  });
}

export type Auth = Awaited<ReturnType<typeof createAuth>>;
