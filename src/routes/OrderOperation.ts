import { OrderOperationController } from "../controllers/OrderOperation";
import { Collection } from "./Collection";
import { ConfigCrudRoutes } from "./ConfigCrudRoutes";

export class OrderOperationCollection extends Collection {
  constructor() {
    super('/maintenance-orders/:maintenanceOrderId/operations', OrderOperationController);
    this.addBaseCrudRoutes(new ConfigCrudRoutes())
  }

}