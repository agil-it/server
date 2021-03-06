import { OrderComponentController } from "../controllers/OrderComponent";
import { Collection } from "./Collection";
import { ConfigCrudRoutes } from "./ConfigCrudRoutes";

export class OrderComponentCollection extends Collection {
  constructor() {
    super('/order-components', OrderComponentController);
    this.addBaseCrudRoutes(new ConfigCrudRoutes())
  }

}