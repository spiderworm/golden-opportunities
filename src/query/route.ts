import type { Route } from './+types/route';
import { createQueryHandler } from './http.server';

const handle = createQueryHandler();
export function action({ request }: Route.ActionArgs): Promise<Response> { return handle(request); }
export function loader({ request }: Route.LoaderArgs): Promise<Response> { return handle(request); }
