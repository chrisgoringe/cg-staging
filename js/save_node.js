import { app } from "../../scripts/app.js";
import { fields_widget, field_for_type } from "./shared.js"

var in_setFields = false

export class SaveNode {
    static before_register(nodeType) {
        const onConnectionsChange = nodeType.prototype.onConnectionsChange;
        nodeType.prototype.onConnectionsChange = function () { 
            update_fields_widget(this) 
            onConnectionsChange?.apply(this, arguments)
        }
        const onConnectInput = nodeType.prototype.onConnectInput;
        nodeType.prototype.onConnectInput = function (slot, type) {     
            if (!field_for_type(type)) return false // don't allow types we can't handle
            return onConnectInput?.apply(this, arguments)
        }
        nodeType.prototype._cg_staging_setVisibility = function(v) { setVisibility(this, v) }

        nodeType.prototype.isSS = true
    }

    static node_created(node) {            
        fields_widget(node).callback = () => {
            if (!in_setFields) update_fields_widget(node)
        }
        setVisibility(node, app.ui.settings.getSettingValue("Staging.ShowFields"))
        if (app.ui.settings.getSettingValue("Staging.SortInputs")) setTimeout(sort_inputs, 1000, [node,])
    }


}

function setVisibility(node, v) {
    fields_widget(node).hidden = !v
}

function update_fields_widget(node) {
    const data_in = sorted_data_inputs(node)
    var fields = ""
    data_in.forEach((input)=>{
        const type = node.graph.links?.[input.link]?.type
        if (type) fields += field_for_type(type)
    })
    setFields(node, fields)
    if (app.ui.settings.getSettingValue("Staging.SortInputs")) sort_inputs(node)
}

function sort_inputs(node) {
        if (!node.inputs) {
            return
        }
        const data_inputs = sorted_data_inputs(node)
        const unlinked    = unlinked_data_inputs(node)[0]
        const not_data_inputs = node.inputs.filter((input)=>(input.name.substring(0,9)!="data.data"))
        if (unlinked) node.inputs = [...data_inputs, unlinked, ...not_data_inputs]
        else node.inputs = [...data_inputs, ...not_data_inputs]
    }

function sorted_data_inputs(node) {
    return node.inputs.filter((input)=>(input.name.substring(0,9)=="data.data" && input.link)).sort( (a,b)=> (parseInt(a.name.substring(9)) - parseInt(b.name.substring(9))) )
}

function unlinked_data_inputs(node) {
    return node.inputs.filter((input)=>(input.name.substring(0,9)=="data.data" && !input.link)).sort( (a,b)=> (parseInt(a.name.substring(9)) - parseInt(b.name.substring(9))) )
}

function setFields(node, fields) {
    in_setFields = true
    try { node.widgets.find((widgets)=>(widgets.name=='fields')).value = fields } 
    finally { in_setFields = false }
}
