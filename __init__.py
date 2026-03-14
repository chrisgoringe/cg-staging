from comfy_api.latest import ComfyExtension, io
from .nodes_staging import SaveStaged, LoadStaged

WEB_DIRECTORY = "./js"
__all__ = [ "WEB_DIRECTORY" ]

async def comfy_entrypoint() -> ComfyExtension:
    class CGStagingExtension(ComfyExtension):
        async def get_node_list(self) -> list[type[io.ComfyNode]]:
            return [ SaveStaged, LoadStaged ]
        
    return CGStagingExtension()

