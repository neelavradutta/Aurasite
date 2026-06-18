import 'dotenv/config';
import Vehicle from '../src/models/Vehicle';
import { connectDatabase, sequelize } from '../src/utils/database';
import { clearVehicleProfileFields, getMissingProfileFields, isUnreadablePlate } from '../src/utils/vehicleProfileGenerator';
import '../src/models';

async function main(): Promise<void> {
  await connectDatabase();

  const vehicles = await Vehicle.findAll();
  let updated = 0;

  for (const vehicle of vehicles) {
    if (isUnreadablePlate(vehicle.plate_number)) {
      const profileFields = Object.keys(clearVehicleProfileFields());
      const row = vehicle.toJSON() as Record<string, unknown>;
      const hasProfile = profileFields.some((key) => {
        const value = row[key];
        return value !== null && value !== undefined && value !== '';
      });
      if (hasProfile) {
        await vehicle.update(clearVehicleProfileFields());
        updated += 1;
      }
      continue;
    }

    const patch = getMissingProfileFields(
      vehicle.plate_number,
      vehicle.toJSON() as Record<string, unknown>
    );
    if (Object.keys(patch).length === 0) continue;
    await vehicle.update(patch);
    updated += 1;
  }

  console.log(`Backfilled profiles for ${updated} vehicle(s).`);
  await sequelize.close();
}

main().catch((error) => {
  console.error('Backfill failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
