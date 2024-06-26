import { fail } from '@sveltejs/kit';
import { validateUser } from '$lib/utils/validator.js'
import db from '$lib/utils/db.js';
import { createAccessToken } from '$lib/utils/authenticator.js';
import errorHandler from '$lib/utils/errorHandler.js';

export const actions = {
    default: async ({ request, url, cookies }) => {
        try {
            let data = Object.fromEntries(await request.formData());
            const validationResult = validateUser(data, ['email', 'password']);

            if(validationResult.status === 400) {
                return validationResult;
            }
            data = validationResult;

            const user = await db.users.login(data);

            if(!user) {
                return fail(401, {
                    error: { message: 'Email or password is incorrect!' },
                });
            }
            if(user.deletedAt) {
                return fail(403, {
                    error: { message: 'Your account has been deleted, contact support for more info.' },
                });
            }
            if(user.blocked) {
                return fail(403, {
                    error: { message: 'Your account has been blocked, contact support for more info.' },
                });
            }
            if(!user.verified) {
                return fail(403, {
                    error: { message: 'You must be verified to log in, check your email for a verification link.' },
                });
            }

            const token = createAccessToken(user);
            cookies.set('access_token', token, { path: '/' });

            if (url.searchParams.has('redirectTo')) {
                throw {
                    status: 303,
                    location: url.searchParams.get('redirectTo')
                };
            }

            throw { status: 303, location: '/' };
        } catch (error) {
            return errorHandler(error, undefined, { logMessage: 'Failed to login' });
        }
    }
}
