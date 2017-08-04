module.exports.checkTaskContext = function(context){
	if (!context || !context.task)
		throw new Error("The context is not object of Task");
}