import { D1DeleteEndpoint } from "chanfana";
import { HandleArgs } from "../../types";
import { NewsModel } from "./base";

export class NewsDelete extends D1DeleteEndpoint<HandleArgs> {
    _meta = {
        model: NewsModel,
    };
}