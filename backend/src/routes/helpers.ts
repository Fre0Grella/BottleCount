import { USER_ERRORS } from '../repositories/userRepository';

/**
 * A session whose user genuinely doesn't exist is a 404; anything else (a D1
 * outage, say) is ours and must not be dressed up as a missing user.
 */
export function userErrorStatus(error: string): 404 | 500 {
  return error === USER_ERRORS.NOT_FOUND ? 404 : 500;
}
