import { D1UpdateEndpoint } from "chanfana";
import { HandleArgs } from "../../types";
import { NewsModel } from "./base";

export class NewsUpdate extends D1UpdateEndpoint<HandleArgs> {
    _meta = {
        model: NewsModel,
        content: true,
        label: true,
        processed: true,
        post_text: true,
        posted: true,
        image_url: true,
        fields: NewsModel.schema.partial(),
    };
}