"""
Hello World 示例插件
演示 Code Classroom 的插件系统
"""

def register(app):
    """插件注册函数，在服务器启动时自动调用"""
    
    @app.get("/api/plugins/hello")
    async def hello():
        return {"code": 0, "message": "Hello from plugin!", "data": {"plugin": "hello-example"}}
    
    print("[HelloPlugin] OK: registered /api/plugins/hello")
