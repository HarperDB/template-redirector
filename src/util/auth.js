import { allowedUserRoles } from './constants.js';

/**
 * Role gate for resources that override a static REST method.
 *
 * The instance `allow*` hooks (allowRead/allowCreate/...) are only invoked by the base
 * `Resource` transactional dispatcher — `Resource.get`/`Resource.post` are `transactional(...)`
 * wrappers that call `resource.allowRead(context.user, ...)` before running the action. A
 * subclass that defines its own `static get`/`static post` shadows that wrapper, so REST
 * dispatches to the subclass static directly and the instance hook never runs. Any static
 * override must therefore perform its own authorization.
 *
 * @param {object} context - Request context.
 * @returns {boolean} True when the request's role is allowed.
 */
export function isAllowedRole(context) {
	return allowedUserRoles.includes(context?.user?.role?.id);
}

/**
 * A 403 response in the same `{ status, headers, data }` shape the other resources return.
 * @returns {object} Forbidden response.
 */
export function forbidden() {
	return {
		status: 403,
		headers: { 'Content-Type': 'application/json' },
		data: { message: 'Forbidden: your role is not permitted to access this endpoint.' },
	};
}
