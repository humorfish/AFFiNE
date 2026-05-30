import { getFeatureFlagSyncer } from '@affine/core/blocksuite/store-extensions/feature-flag/feature-flag-syncer';
import {
  type StoreExtensionContext,
  StoreExtensionProvider,
} from '@blocksuite/affine/ext-loader';
import { z } from 'zod';

// Use z.custom instead of z.instanceof to allow duck-typed implementations
// (story app provides a plain object, not a real FeatureFlagService instance)
const optionsSchema = z.object({
  featureFlagService: z
    .custom(
      v => v == null || typeof v === 'object',
      'Expected FeatureFlagService or null'
    )
    .optional(),
});

export class FeatureFlagStoreExtension extends StoreExtensionProvider {
  override name = 'feature-flag-store-extension';

  override schema = optionsSchema;

  override setup(
    context: StoreExtensionContext,
    options?: z.infer<typeof optionsSchema>
  ) {
    super.setup(context, options);
    const featureFlagService = options?.featureFlagService;
    if (!featureFlagService) {
      return;
    }
    context.register(getFeatureFlagSyncer(featureFlagService));
  }
}
