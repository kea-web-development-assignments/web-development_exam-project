import { PrismaClient } from "@prisma/client";
import bcrypt from 'bcrypt';

let db = new PrismaClient();

db = db
    .$extends({
        query: {
            $allModels: {
                //on update query, update `updated_at` field
                update: async ({ args, query }) => {
                    args.data = { ...args.data, updatedAt: new Date() };

                    return query(args);
                },
            },
            users: {
                //on create user(s), hash password
                create: async ({ args, query }) => {
                    args.data.password = await bcrypt.hash(args.data.password, 10);

                    return query(args);
                },
                createManyAndReturn: async ({ args, query }) => {
                    for (const user of args.data ?? []) {
                        user.password = await bcrypt.hash(user.password, 10);
                    }

                    return query(args);
                },
            }
        },
        model: {
            users: {
                login: async ({ email, password }) => {
                    if(!email || !password) {
                        return;
                    }
                    
                    const user = await db.users.findFirst({ where: { email } });

                    if(!user || !(await bcrypt.compare(password, user.password))) {
                        return;
                    }

                    return user;
                },
                signup: async (data) => {
                    const user = await db.users.create({ data });
                    const { id: verificationCode } = await db.verificationCodes.create({
                        data: { userId: user.id },
                    });

                    return { user, verificationCode };
                },
                verifyAccount: async (code) => {
                    const verificationCode = await db.verificationCodes.findFirst({ where: { id: code } });

                    if(!verificationCode) {
                        throw {
                            status: 404,
                            message: 'Verification code not found',
                        }
                    }

                    const user = await db.users.update({
                        where: { id: verificationCode.userId },
                        data: { verified: true },
                    });
                    
                    if(!user) {
                        throw {
                            status: 404,
                            message: 'No user with that verification code',
                        }
                    }

                    await db.verificationCodes.delete({ where: { id: code } });
                    return user;
                },
                resetPassword: async (code, newPassword) => {
                    const forgottenPasswordRequest = await db.forgottenPasswordRequests.findFirst({ where: { id: code } });

                    if(!forgottenPasswordRequest) {
                        throw {
                            status: 404,
                            message: 'Password reset request not found',
                        }
                    }

                    const passwordHash = await bcrypt.hash(newPassword, 10);
                    const user = await db.users.update({
                        where: { id: forgottenPasswordRequest.userId },
                        data: { password: passwordHash },
                    });

                    if(!user) {
                        throw {
                            status: 404,
                            message: 'No user with that password reset request',
                        }
                    }

                    await db.forgottenPasswordRequests.delete({ where: { id: code } });
                    return user;
                }
            }
        }
    })
    //extending the same operation (`update`) on `$allModels` AND `users` causes one of them to be overriden,
    //calling `$extends` a second time prevents this 
    .$extends({
        query: {
            users: {
                //on user soft delete, delete all their properties
                update: async ({ args, query }) => {
                    if(args.data.deletedAt instanceof Date && args.where.id) {
                        const [ userQueryResult ] = await db.$transaction([
                            query(args),
                            db.properties.deleteMany({ where: { userId: args.where.id } }),
                        ]);

                        return userQueryResult;
                    }

                    return query(args);
                },
            },
        },
    });

export default db;