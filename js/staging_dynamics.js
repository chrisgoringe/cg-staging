import { app } from "../../scripts/app.js";
import { SaveNode } from "./save_node.js"
import { LoadNode } from "./load_node.js"

app.registerExtension({
	name: "cg.customnodes.staging_dynamics",
    settings: [
        {
            id: "Staging.About",
            name: `Version 0.1`,
            type: () => {return document.createElement('span')},
        },
        {
            id: "Staging.ShowFields",
            name: "Show the fields on the save node",
            type: "boolean",
            tooltip: "Show the field list on the Save node",
            defaultValue: false,
            onChange: (v) => { app.graph?.nodes?.forEach((node)=>(node._cg_staging_setVisibility?.(v))) }
        },
        {
            id: "Staging.SortInputs",
            name: "Fix input weirdness",
            type: "boolean",
            tooltip: "Try to fix the weird input reordering Comfy does sometimes",
            defaultValue: false,
        },
    ],
  
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeType.comfyClass === "Load Staged") LoadNode.before_register(nodeType)
        if (nodeType.comfyClass === "Save Staged") SaveNode.before_register(nodeType)

    },
    async nodeCreated(node) { 
        if (node.isLS) LoadNode.node_created(node)
        if (node.isSS) SaveNode.node_created(node)
    },
    afterConfigureGraph() {
        app.graph.nodes.forEach((node)=>{ node._cg_staging_afterConfigureGraph?.() })
    },

});



