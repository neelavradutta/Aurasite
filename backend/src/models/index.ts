import Vehicle from './Vehicle';
import Detection from './Detection';
import Alert from './Alert';
import User from './User';
import Camera from './Camera';

export { Vehicle, Detection, Alert, User, Camera };

export function registerModels(): void {
  // Associations registered in model files; Camera imported for Sequelize sync.
}
