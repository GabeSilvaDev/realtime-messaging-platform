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

export {
  updateProfileSchema as updateProfileDataSchema,
  updateDisplayNameSchema,
  updateBioSchema,
  updateStatusSchema as updatePresenceStatusSchema,
  avatarFileSchema,
  uploadAvatarSchema,
  avatarProcessingOptionsSchema,
  profileVisibilitySchema,
  notificationSettingsSchema,
  updateProfileSettingsSchema,
  updatePresenceSchema,
  bulkPresenceQuerySchema,
  profileIdParamSchema,
} from './profile.schemas';

export type {
  UpdateProfileInput as UpdateProfileDataInput,
  UpdateDisplayNameInput,
  UpdateBioInput,
  UpdateStatusInput as UpdatePresenceStatusInput,
  AvatarFileInput,
  UploadAvatarInput,
  AvatarProcessingOptionsInput,
  ProfileVisibilityInput,
  NotificationSettingsInput,
  UpdateProfileSettingsInput,
  UpdatePresenceInput,
  BulkPresenceQuery,
  ProfileIdParam,
} from './profile.schemas';
