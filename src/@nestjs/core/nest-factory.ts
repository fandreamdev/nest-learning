import { NestApplication } from "./nest-application"
import { Logger } from "./log"

export class NestFactory {
  static async create(module: any) {
    Logger.log("Starting Nest application...", "NestFactory")

    const app = new NestApplication(module)

    return app
  }
}
