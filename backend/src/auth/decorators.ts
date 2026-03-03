import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const ALLOW_MISSING_ORG_KEY = 'allowMissingOrganization';

export const AllowMissingOrganization = () => SetMetadata(ALLOW_MISSING_ORG_KEY, true);

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
});
