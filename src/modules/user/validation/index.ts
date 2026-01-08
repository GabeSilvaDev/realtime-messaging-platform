export {
  createUserSchema,
  searchUsersSchema,
  updateAvatarSchema,
  updateProfileSchema,
  updateStatusSchema,
  updateUserSchema,
  userIdParamSchema,
} from './user.schemas';

export type {
  CreateUserInput,
  SearchUsersQuery,
  UpdateAvatarInput,
  UpdateProfileInput,
  UpdateStatusInput,
  UpdateUserInput,
  UserIdParam,
} from './user.schemas';

export {
  addContactSchema,
  blockUserSchema,
  contactIdParamSchema,
  listContactsSchema,
  searchUsersForContactSchema,
  updateContactSchema,
} from './contact.schemas';

export type {
  AddContactInput,
  BlockUserInput,
  ContactIdParam,
  ListContactsQuery,
  SearchUsersForContactQuery,
  UpdateContactInput,
} from './contact.schemas';
